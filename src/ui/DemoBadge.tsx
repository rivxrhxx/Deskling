/**
 * Always-visible marker while the demo source runs (FR-D5). There is intentionally no way to hide it:
 * the app renders it whenever the active source is a demo source.
 */
export function DemoBadge() {
  return (
    <span
      className="demo-badge"
      role="note"
      aria-label="데모 모드: 실제 에이전트 데이터가 아닙니다"
      title="데모 모드: 실제 에이전트 데이터가 아닙니다"
      data-no-drag=""
    >
      DEMO
    </span>
  );
}
