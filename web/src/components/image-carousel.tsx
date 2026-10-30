import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

export interface CarouselImage {
  url: string;
  path?: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  /** 受控索引，与外部状态（缩略图选中 / 表单状态）双向同步 */
  index: number;
  onIndexChange?: (index: number) => void;
  className?: string;
  /** 图片填充方式，编辑器里用 contain 看全图，封面位置用 cover */
  imgClassName?: string;
  showCounter?: boolean;
}

/**
 * 左右箭头统一走这套样式：压在图片上的深色圆形按钮。
 * 底色要够深（/70）—— 半透明黑叠在浅色画面上会变成中灰，白箭头就糊了；
 * ring 是给暗色主题下的近黑背景留一点轮廓，不然只剩一个孤零零的箭头。
 */
const ARROW_CLASS =
  "h-8 w-8 border-0 bg-black/70 text-white shadow-none ring-1 ring-white/20 backdrop-blur-sm hover:bg-black/85 hover:text-white disabled:invisible";

/**
 * 配图轮播。编辑器和预览弹窗共用一份，索引由外部持有，
 * 这样点缩略图、拖拽排序、删图之后轮播能跟着拨过去。
 */
export function ImageCarousel({
  images,
  index,
  onIndexChange,
  className,
  imgClassName,
  showCounter = true,
}: ImageCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();

  // embla → 外部：滑动 / 键盘 / 点箭头之后把新索引抛出去
  useEffect(() => {
    if (!api) return;
    const onSelect = () => onIndexChange?.(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  // embla 只在容器尺寸变化时重算吸附点，图片增删要手动 reInit，否则箭头会错位
  useEffect(() => {
    if (!api) return;
    api.reInit();
  }, [api, images.length]);

  // 外部 → embla：点缩略图或删掉一张之后把轮播拨到对应位置
  useEffect(() => {
    if (!api) return;
    if (api.selectedScrollSnap() !== index) api.scrollTo(index);
  }, [api, index]);

  return (
    <Carousel
      setApi={setApi}
      opts={{ startIndex: index, loop: false, align: "start" }}
      // CarouselContent 的外层 div 写死了 overflow-hidden 没有高度，这里补一下才能撑满容器
      className={cn("h-full [&>div]:h-full", className)}
    >
      <CarouselContent className="-ml-0 h-full">
        {images.map((img, i) => (
          <CarouselItem key={img.path || img.url} className="h-full pl-0">
            <img
              src={img.url}
              alt=""
              loading={i === index ? "eager" : "lazy"}
              className={cn("h-full w-full object-contain", imgClassName)}
            />
          </CarouselItem>
        ))}
      </CarouselContent>

      {images.length > 1 && (
        <>
          <CarouselPrevious
            type="button"
            variant="secondary"
            className={cn("left-2 top-1/2 -translate-y-1/2", ARROW_CLASS)}
            aria-label="上一张配图"
          />
          <CarouselNext
            type="button"
            variant="secondary"
            className={cn("right-2 top-1/2 -translate-y-1/2", ARROW_CLASS)}
            aria-label="下一张配图"
          />
          {showCounter && (
            <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
              {index + 1} / {images.length}
            </span>
          )}
        </>
      )}
    </Carousel>
  );
}
