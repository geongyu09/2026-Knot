/** 캔버스 밖에서 부를 수 있는 동작 */
export interface ParticleIconHandle {
  /** 입자가 위에서 떨어져 아이콘 모양으로 모인 뒤 진짜 아이콘을 보여 줘요 */
  assemble: () => void;
  /** 아이콘이 잠깐 입자로 풀렸다가 다시 모여요. 올렸을 때 써요 */
  wake: () => void;
}
