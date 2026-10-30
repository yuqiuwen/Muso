"""把 .env 读进 os.environ。

Celery 通过 `-A make_celery` 启动，此时 pydantic-settings 还没机会读文件；
broker / db 地址必须先落到环境变量里。
"""

from pathlib import Path

from dotenv import load_dotenv


def load_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)
