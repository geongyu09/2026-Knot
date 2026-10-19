import { handleRequest } from "./relay";

/**
 * 프론트 Cloudflare Worker의 진입점이에요(ADR 838).
 *
 * Workers 런타임은 이 파일의 이름 있는 내보내기를 모두 처리기로 읽으려 해서, 기본 내보내기만 두고 중계 코드는 `relay`에 둬요.
 */
export default { fetch: handleRequest };
