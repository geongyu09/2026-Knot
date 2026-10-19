import { isHttpError } from "@api/httpClient/error";
import { captureRequestError } from "@provider/sentry";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  // 화면마다 오류를 따로 처리해도 API 오류는 여기서 모아 보고해요. 보낼지는 Sentry의 beforeSend가 정해요
  queryCache: new QueryCache({
    onError: (error) => captureRequestError({ error, source: "query" }),
  }),
  mutationCache: new MutationCache({
    onError: (error) => captureRequestError({ error, source: "mutation" }),
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
