interface TempWorkspaceLeave {
  /** 지금 워크스페이스에서 내가 맡은 역할 */
  myRole: "OWNER" | "MEMBER";
  /** 나를 뺀 멤버 목록. 비어 있으면 워크스페이스에 나 혼자예요 */
  otherMembers: { id: number; name: string }[];
}

/**
 * 워크스페이스 나가기에서 어떤 창을 띄울지 정하는 임시 값.
 *
 * 나가기 API를 연결하기 전이라 내 역할과 다른 멤버를 여기에 적어 둬요.
 * shortcut: 테스트와 스토리가 값을 바꿔 창마다 띄워 볼 수 있게 고칠 수 있는 객체로 둬요, API를 연결하면 응답으로 바꾸고 지워요.
 */
export const TEMP_WORKSPACE_LEAVE: TempWorkspaceLeave = {
  myRole: "OWNER",
  otherMembers: [
    { id: 1, name: "도넛" },
    { id: 2, name: "흑곰" },
    { id: 3, name: "루루" },
  ],
};
