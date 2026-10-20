/** 로그인 뒤 돌아갈 경로. 로그인으로 보내기 직전에 저장하고, 복귀 이동을 실행하는 쪽이 지워요 */
const RETURN_PATH_KEY = "knot.auth.returnPath";

// 비공개 창·저장소 차단처럼 sessionStorage를 못 쓰면 예외를 삼켜 기존 동작(로그인 뒤 홈)을 유지해요

/** 로그인 뒤 돌아갈 경로(`/invite/<credential>` 같은 경로 문자열)를 보관해요. 유효시간은 없어요 */
export const saveAuthReturnPath = (path: string) => {
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, path);
  } catch {
    // 저장 실패는 복귀 없이 기존 동작으로 둬요
  }
};

/** 보관한 복귀 경로를 돌려줘요. 없으면 `undefined`이고, 읽어도 지우지 않아요 */
export const readAuthReturnPath = () => {
  try {
    return sessionStorage.getItem(RETURN_PATH_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

/** 복귀 이동을 실행할 때 불러 보관한 경로를 지워요. 렌더 중에는 부르지 않아요 */
export const clearAuthReturnPath = () => {
  try {
    sessionStorage.removeItem(RETURN_PATH_KEY);
  } catch {
    // 지우기 실패는 다음 복귀에서 한 번 더 시도돼요
  }
};
