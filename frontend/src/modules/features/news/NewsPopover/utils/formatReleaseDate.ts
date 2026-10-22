/**
 * 노트의 배포 날짜(`2026-10-20`)를 날짜 묶음 머리 문구(`10월 20일`)로 바꿔요.
 *
 * 적은 날짜를 그대로 보여 줘야 해서 `Date`로 바꾸지 않아요. `Date`는 브라우저 시간대에 따라 하루 앞뒤로 밀릴 수 있어요.
 */
export const formatReleaseDate = (releasedAt: string) => {
  const [, month, day] = releasedAt.split("-").map(Number);

  return `${month}월 ${day}일`;
};
