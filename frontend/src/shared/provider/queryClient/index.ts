import { isHttpError } from "@api/httpClient/error";
import { captureRequestError } from "@provider/sentry";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /**
       * 실패를 누가 Sentry로 보내는지. `caller`면 MutationCache는 보내지 않고 부르는 쪽이 골라 보내요.
       * 같은 요청을 거듭 보내는 곳(재시도 루프, 주기 요청)이 연속 실패의 첫 번째와 포기한 실패만 보내려고 써요(`createRepeatedFailureReporter`)
       */
      errorReport?: "caller";
    };
  }
}

export const queryClient = new QueryClient({
  // 화면마다 오류를 따로 처리해도 API 오류는 여기서 모아 보고해요. 보낼지는 Sentry의 beforeSend가 정해요
  queryCache: new QueryCache({
    onError: (error) => captureRequestError({ error, source: "query" }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _onMutateResult, mutation) => {
      if (mutation.meta?.errorReport === "caller") return;

      captureRequestError({ error, source: "mutation" });
    },
  }),
  defaultOptions: {
    queries: {
      // 4xx 오류에 대해서는 재시도 하지 않음
      retry: (failureCount, error) => {
        if (isHttpError(error) && error.isClientError) return false;
        return failureCount < 2;
      },
    },
  },
});
