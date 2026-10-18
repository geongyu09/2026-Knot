declare module "*.css";

declare namespace NodeJS {
  interface ProcessEnv {
    API_BASE_URL: string;
    /** DefinePlugin이 문자열로 넣어요. ProcessEnv가 문자열 인덱스 시그니처라 boolean으로 못 둬요 */
    API_MOCKING: "true" | "false";
    /** 비어 있으면 PostHog 사용 기록을 켜지 않아요 */
    POSTHOG_KEY: string;
    POSTHOG_HOST: string;
  }
}
declare module "*.svg" {
  import type { FunctionComponent, SVGProps } from "react";
  const Component: FunctionComponent<
    SVGProps<SVGSVGElement> & { size?: number | string }
  >;
  export default Component;
}

declare module "*.svg?url" {
  const src: string;
  export default src;
}

declare module "*.gif" {
  const src: string;
  export default src;
}

/** AudioWorklet 전역. lib.dom에 없어 `pcmProcessor.ts`가 쓰는 만큼만 선언해요 */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor,
): void;
