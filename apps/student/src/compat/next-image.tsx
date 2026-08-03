import type {
  CSSProperties,
  ImgHTMLAttributes,
} from "react";

type ImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height"
> & {
  src: string | { src: string };
  alt: string;
  width?: number | `${number}`;
  height?: number | `${number}`;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
  loader?: unknown;
};

export default function Image({
  src,
  fill,
  priority,
  quality: _quality,
  unoptimized: _unoptimized,
  loader: _loader,
  style,
  width,
  height,
  ...props
}: ImageProps) {
  const resolved =
    typeof src === "string"
      ? src
      : src?.src ?? "";

  const fillStyle: CSSProperties | undefined = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        ...style,
      }
    : style;

  return (
    <img
      {...props}
      src={resolved}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={fillStyle}
      loading={priority ? "eager" : props.loading}
      decoding={props.decoding ?? "async"}
    />
  );
}
