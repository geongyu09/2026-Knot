/** `#3C3B39` 같은 색상 토큰을 `rgba()`에 넣을 `60,59,57` 꼴로 바꿔요. 캔버스에 테마 색을 투명도와 함께 칠할 때 써요. */
export const hexToRgb = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(",");
