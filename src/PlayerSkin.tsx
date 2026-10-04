import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
export function PlayerSkin({
  skin,
  name,
  headOnly = false,
}: {
  skin: string | null;
  name: string | null;
  headOnly?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setReady(false);
    setFailed(false);
    if (!skin) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      const ctx = canvas.current?.getContext('2d');
      if (!active || !ctx) return;
      ctx.clearRect(0, 0, headOnly ? 32 : 80, headOnly ? 32 : 160);
      ctx.imageSmoothingEnabled = false;
      if (headOnly) {
        ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 32, 32);
        ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 32, 32);
        setReady(true);
        return;
      }
      const part = (x: number, y: number, w: number, h: number, dx: number, dy: number) =>
        ctx.drawImage(image, x, y, w, h, dx, dy, w * 5, h * 5);
      part(8, 8, 8, 8, 20, 0);
      part(40, 8, 8, 8, 20, 0);
      part(20, 20, 8, 12, 20, 40);
      part(44, 20, 4, 12, 0, 40);
      part(4, 20, 4, 12, 20, 100);
      part(image.height === 64 ? 36 : 44, image.height === 64 ? 52 : 20, 4, 12, 60, 40);
      part(image.height === 64 ? 20 : 4, image.height === 64 ? 52 : 20, 4, 12, 40, 100);
      if (image.height === 64) {
        part(20, 36, 8, 12, 20, 40);
        part(44, 36, 4, 12, 0, 40);
        part(52, 52, 4, 12, 60, 40);
        part(4, 36, 4, 12, 20, 100);
        part(4, 52, 4, 12, 40, 100);
      }
      setReady(true);
    };
    image.onerror = () => {
      if (active) setFailed(true);
    };
    image.src = skin;
    return () => {
      active = false;
    };
  }, [skin, headOnly]);
  const Wrapper = headOnly ? 'span' : 'div';
  return (
    <Wrapper className={headOnly ? 'player-head' : 'player-skin'}>
      <canvas
        ref={canvas}
        width={headOnly ? 32 : 80}
        height={headOnly ? 32 : 160}
        role="img"
        aria-label={`${name ?? 'Minecraft'} 플레이어 ${headOnly ? '머리' : '스킨'}`}
        hidden={!ready}
      />
      {!ready && (
        <>
          <UserRound size={headOnly ? 20 : 44} />
          {!headOnly && <small>{skin && !failed ? '스킨 불러오는 중' : '스킨 없음'}</small>}
        </>
      )}
    </Wrapper>
  );
}
