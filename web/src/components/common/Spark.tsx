/** 파생 지수(처음 = 100) 꺾은선. 보이는 그림일 뿐이라 보조기술에서 뺀다(숫자는 옆 글자로 준다). 결과 의미가 없는 공용 부품 */
type Series = { pts: readonly number[]; cls: "ln-main" | "ln-bench" };

export function Spark({ series, w = 300, h = 90 }: { series: Series[]; w?: number; h?: number }) {
  const all = series.flatMap((s) => s.pts);
  const min = Math.min(...all), max = Math.max(...all), pad = 6;
  const x = (i: number, n: number) => (i / Math.max(1, n - 1)) * w;
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" aria-hidden="true" focusable="false">
      {series.map((s) => (
        <polyline key={s.cls} className={s.cls} points={s.pts.map((v, i) => `${x(i, s.pts.length).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
      ))}
    </svg>
  );
}
