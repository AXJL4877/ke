"use client";

export function VideoPreview({ src }: { src: string }) {
  const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(src) || src.includes("video");

  if (!isVideo) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="text-sm underline"
      >
        打开结果
      </a>
    );
  }

  return (
    <video
      src={src}
      controls
      className="max-h-64 w-full rounded-md bg-black"
    />
  );
}
