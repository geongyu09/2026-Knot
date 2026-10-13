import { MAX_RECORDING_DURATION_MS } from "@constants/recording";
import { useRecordingStore } from "@store/recordingStore";
import { useEffect, useRef } from "react";

interface UseRecordingMaxDurationParams {
  /** 녹음한 시간이 상한에 닿았을 때 실행할 콜백 함수 */
  onReached: () => void;
}

// TODO: 콜백 받을꺼면 공통 훅으로 만들기, 안받을꺼면 도메닝 훅으로 만들기

/**
 * 녹음한 시간이 상한(2시간)에 닿는 순간을 알려 주는 도메인 훅.
 *
 * 일시정지 중에는 시간이 흐르지 않아 기다리지 않고, 이어서 녹음하거나 녹음한 시간이 서버 값으로 맞춰지면
 * 남은 시간으로 다시 기다려요. 한 번 알린 뒤에는 녹음한 시간이 다시 맞춰져 남은 시간이 생길 때만 다시 알려요.
 *
 * 콜백은 항상 가장 최근에 전달된 함수가 실행돼요.
 */
const useRecordingMaxDuration = ({
  onReached,
}: UseRecordingMaxDurationParams) => {
  const accumulatedMs = useRecordingStore((state) => state.accumulatedMs);
  const resumedAt = useRecordingStore((state) => state.resumedAt);
  const onReachedRef = useRef(onReached);

  useEffect(() => {
    onReachedRef.current = onReached;
  }, [onReached]);

  useEffect(() => {
    // 녹음을 정지/중지 하면 타이머를 열지 않는다. (정지, 중지 되면 null값이 들어온다.)
    // TODO: 너무 useRecordingStore의 내부 로직에 의존적인 코드임. 수정 필요함.
    if (resumedAt === null) return;

    const remainingMs =
      MAX_RECORDING_DURATION_MS - accumulatedMs - (Date.now() - resumedAt);
    // 상한을 이미 채운 시간으로 맞춰졌다면 기다리지 않아요. 바로 알리면 알림과 시간 맞추기가 쉬지 않고 되풀이돼요
    if (remainingMs <= 0) return;

    // 남은 시간이 딱 지날 때 콜백을 실행시키도록 한다.
    const timer = setTimeout(() => onReachedRef.current(), remainingMs);

    return () => clearTimeout(timer);
  }, [accumulatedMs, resumedAt]);
};

export default useRecordingMaxDuration;
