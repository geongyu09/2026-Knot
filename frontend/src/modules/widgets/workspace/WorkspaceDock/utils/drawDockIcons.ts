/**
 * 독 아이콘을 24×24 좌표계의 캔버스에 그려요. 입자가 모일 자리를 뽑는 데 써요.
 * 경로는 `assets/icons/speechBubble.svg`, `assets/icons/send.svg`와 같아요.
 */

/** 채팅 칸의 말풍선. 파형 입자가 갈라져 모이는 모양이기도 해요 */
export const drawSpeechBubbleIcon = (context: CanvasRenderingContext2D) => {
  context.lineWidth = 1.6;
  context.stroke(
    new Path2D(
      "M6.5 4.75H17.5C19.0188 4.75 20.25 5.98122 20.25 7.5V14C20.25 15.5188 19.0188 16.75 17.5 16.75H11.4L7.75 19.9V16.75H6.5C4.98122 16.75 3.75 15.5188 3.75 14V7.5C3.75 5.98122 4.98122 4.75 6.5 4.75Z",
    ),
  );
  [8.75, 12, 15.25].forEach((x) => {
    context.beginPath();
    context.arc(x, 10.75, 1.25, 0, Math.PI * 2);
    context.fill();
  });
};

/** 보내기 화살표는 16×16 아이콘이라 24 좌표계에 맞게 1.5배로 키워 그려요 */
export const drawSendIcon = (context: CanvasRenderingContext2D) => {
  context.scale(1.5, 1.5);
  context.lineWidth = 1.7;
  context.stroke(new Path2D("M7.9999 13V3M12.5999 7.6L7.9999 3L3.3999 7.6"));
};
