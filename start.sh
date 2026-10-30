#!/usr/bin/env bash
#
# 妙作 Muso 一键启动：同时拉起 FastAPI（默认 8000）与 Vite 前端（默认 8081）。
# Ctrl+C 会一起停掉，不会留下孤儿进程。
#
#   ./start.sh                  # 默认端口
#   ./start.sh --api-port 8010 --web-port 8090
#   ./start.sh --no-reload      # 后端关掉热重载
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT/api"
WEB_DIR="$ROOT/web"
LOG_DIR="$ROOT/.logs"

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-8081}"
API_HOST="${API_HOST:-127.0.0.1}"
RELOAD=1

# ---------- 参数 ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-port) API_PORT="${2:?缺少端口号}"; shift 2 ;;
    --web-port) WEB_PORT="${2:?缺少端口号}"; shift 2 ;;
    --no-reload) RELOAD=0; shift ;;
    -h|--help)
      # 打印文件头的注释块（跳过 shebang，遇到第一条非注释行就停）
      awk 'NR>1 { if ($0 !~ /^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *) echo "未知参数：$1（用 --help 看用法）" >&2; exit 1 ;;
  esac
done

# ---------- 输出 ----------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  RED=$'\033[31m'; PURPLE=$'\033[35m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; PURPLE=""; RESET=""
fi
info()  { printf '%s\n' "${PURPLE}▸${RESET} $*"; }
ok()    { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn()  { printf '%s\n' "${YELLOW}!${RESET} $*"; }
die()   { printf '%s\n' "${RED}✗${RESET} $*" >&2; exit 1; }

port_busy() {
  # 只做 TCP 连接探测：不依赖具体路径返回 200，也不受 http_proxy 影响
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

# ---------- 前置检查 ----------
command -v uv  >/dev/null 2>&1 || die "没找到 uv。安装：curl -LsSf https://astral.sh/uv/install.sh | sh"
command -v npm >/dev/null 2>&1 || die "没找到 npm。请先安装 Node.js 18+。"
[[ -f "$API_DIR/pyproject.toml" ]] || die "目录结构不对：$API_DIR/pyproject.toml 不存在"
[[ -f "$WEB_DIR/package.json" ]]   || die "目录结构不对：$WEB_DIR/package.json 不存在"

if [[ ! -d "$WEB_DIR/node_modules" ]]; then
  warn "前端依赖还没装，正在执行 npm install（只需一次）…"
  ( cd "$WEB_DIR" && npm install --no-audit --no-fund )
fi

if [[ ! -f "$API_DIR/.env" && -f "$API_DIR/.env.example" ]]; then
  warn "api/.env 不存在，已从 .env.example 复制一份"
  cp "$API_DIR/.env.example" "$API_DIR/.env"
fi

mkdir -p "$LOG_DIR"

# ---------- 进程管理 ----------
PIDS=()
FIFOS=()

# 递归收子进程：npm -> sh -> node(vite)、uvicorn reloader -> worker 都能带走
kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$sig"
  done
  kill -"$sig" "$pid" 2>/dev/null || true
}

cleanup() {
  local code="${1:-$?}"
  trap - INT TERM EXIT
  # 收尾阶段 bash 会打作业终止通知（"Terminated: 15"），对用户没意义，压掉
  exec 2>/dev/null
  local pid
  printf '\n'
  if [[ ${#PIDS[@]} -eq 0 ]]; then
    ok "没有需要停止的进程"
    exit "$code"
  fi
  info "正在停止服务…"
  for pid in "${PIDS[@]}"; do
    [[ -z "$pid" ]] && continue
    kill -0 "$pid" 2>/dev/null && kill_tree "$pid" TERM
  done
  for pid in "${PIDS[@]}"; do
    [[ -z "$pid" ]] && continue
    for _ in $(seq 1 50); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    kill_tree "$pid" KILL
  done
  ok "已全部停止（日志在 ${DIM}${LOG_DIR}${RESET}）"
  if [[ ${#FIFOS[@]} -gt 0 ]]; then
    rm -f "${FIFOS[@]}"
  fi
  exit "$code"
}
# Ctrl+C / kill 是用户主动停止，退出码记 0，别让上层脚本（或 IDE 任务面板）判成失败
on_signal() { cleanup 0; }
trap on_signal INT TERM
trap cleanup EXIT

# 后台任务不进作业表，避免退出时 bash 打一堆 "Terminated" 通知
# 用法：spawn <名字> <工作目录> <命令...>；启动后的 pid 放在 LAST_PID
# 日志走 FIFO 转接：服务 -> 管道 -> sed 加前缀 -> tee 落盘。
# 这样 sed/tee 是脚本自己的子进程而不是服务的，收服务时不会把它们一起打死（否则 bash 会报作业终止）。
spawn() {
  local name="$1" dir="$2"
  shift 2
  local fifo="$LOG_DIR/.$name.pipe"
  rm -f "$fifo"
  mkfifo "$fifo"
  FIFOS+=("$fifo")

  ( sed -u "s/^/${DIM}[$name]${RESET} /" <"$fifo" | tee "$LOG_DIR/$name.log" ) &
  disown $! 2>/dev/null || true

  ( cd "$dir" && exec "$@" ) >"$fifo" 2>&1 &
  LAST_PID=$!
  disown "$LAST_PID" 2>/dev/null || true
  PIDS+=("$LAST_PID")
}

# ---------- 后端 ----------
API_PID=""
if port_busy "$API_PORT"; then
  warn "端口 ${API_PORT} 已有服务在跑，跳过后端启动"
else
  info "启动后端 → http://${API_HOST}:${API_PORT}"
  UVICORN_ARGS=(app.main:app --host "$API_HOST" --port "$API_PORT")
  # 注意别写成 `[[ ... ]] && args+=(...)`：条件为假时整条 AND-OR 列表返回 1，
  # 在 set -e 下会让脚本直接退出（--no-reload 就会走到这个坑）。
  if [[ "$RELOAD" == "1" ]]; then
    UVICORN_ARGS+=(--reload)
    RELOAD_TEXT="开"
  else
    RELOAD_TEXT="关"
  fi
  spawn api "$API_DIR" uv run uvicorn "${UVICORN_ARGS[@]}"
  API_PID="$LAST_PID"
fi

# ---------- 等后端起来 ----------
if [[ -n "$API_PID" ]]; then
  printf '%s' "  等待后端就绪"
  ready=0
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null --max-time 1 "http://$API_HOST:$API_PORT/v1/sys/health" 2>/dev/null; then
      ready=1; break
    fi
    kill -0 "$API_PID" 2>/dev/null || break
    printf '.'; sleep 0.5
  done
  printf '\n'
  if [[ "$ready" == "1" ]]; then
    ok "后端就绪（${API_HOST}:${API_PORT}，热重载 ${RELOAD_TEXT}）"
  else
    die "后端没起来，看看 ${LOG_DIR}/api.log"
  fi
fi

# ---------- 前端 ----------
if port_busy "$WEB_PORT"; then
  warn "端口 ${WEB_PORT} 已有服务在跑，跳过前端启动"
else
  info "启动前端 → http://127.0.0.1:${WEB_PORT}"
  spawn web "$WEB_DIR" \
    env VITE_PORT="$WEB_PORT" VITE_API_PROXY_TARGET="http://${API_HOST}:${API_PORT}" \
    npm run dev
  WEB_PID="$LAST_PID"

  printf '%s' "  等待前端就绪"
  ready=0
  for _ in $(seq 1 120); do
    # 首次请求要等 Vite 编译 + SSR，超时给宽一点；
    # 若超时太短，curl 会在响应中途断开，Vite 那边会刷一串 ECONNRESET 堆栈
    if curl -fsS -o /dev/null --max-time 20 "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null; then
      ready=1; break
    fi
    kill -0 "$WEB_PID" 2>/dev/null || break
    printf '.'; sleep 0.5
  done
  printf '\n'
  if [[ "$ready" == "1" ]]; then
    ok "前端就绪"
  else
    die "前端没起来，看看 ${LOG_DIR}/web.log"
  fi
fi

# ---------- 收尾 ----------
printf '\n'
if [[ ${#PIDS[@]} -eq 0 ]]; then
  printf '%s\n' "${BOLD}两个服务都已经在跑了${RESET}，本脚本没有需要启动的进程。"
  printf '  %s  %s\n' "工作台 " "${BOLD}http://127.0.0.1:${WEB_PORT}${RESET}"
  exit 0
fi

printf '%s\n' "${BOLD}妙作 Muso 已启动${RESET}"
printf '  %s  %s\n' "工作台 " "${BOLD}http://127.0.0.1:${WEB_PORT}${RESET}"
printf '  %s  %s\n' "接口文档" "http://${API_HOST}:${API_PORT}/docs"
printf '  %s  %s\n' "日志    " "${LOG_DIR}/api.log · ${LOG_DIR}/web.log"
printf '%s\n' "${DIM}按 Ctrl+C 停止${RESET}"
printf '\n'

# 盯着子进程：任一挂掉就把其余的也收掉，避免半死不活
while :; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      warn "有服务退出了，正在停止其余服务…"
      exit 1
    fi
  done
  sleep 1
done
