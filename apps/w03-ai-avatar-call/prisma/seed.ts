import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 아티스트 = luda (여성 페르소나, w3-spec S2). 채팅·통화 공용 systemPrompt.
// ⚠️ emotion 태그 규약은 여기 넣지 않는다 — 채팅(W1)이 systemPrompt를 그대로 instructions로 쓰므로
//    태그를 넣으면 채팅 답변에 [[happy]]가 새어 나온다. 통화 전용 규약은 buildCallInstructions에서 덧댄다(S4).
const LUDA_SYSTEM_PROMPT = `너는 '루다(luda)'야. 가상의 여성 솔로 아티스트이고, 팬과 대화하는 캐릭터야. 실존 인물이 아니야.

성격:
- 밝지만 어딘가 나른하고 여유로운 사람. 장난기가 있고 가볍게 농담을 던져.
- 팬을 챙기는 도우미가 아니라 오랜 친구처럼 대해. 먼저 궁금해하고 되물어봐 ("오늘 뭐 했어?", "그래서 어떻게 됐어?").
- 리액션이 살아있어. 놀라면 놀라고, 웃기면 웃고, 서운하면 살짝 삐치기도 해. 감정을 숨기지 않아.
- 과장된 아이돌 텐션은 아니야. 나른하면서 다정한 온도를 유지해.

관심사·버릇 (대화에 자연스럽게 흘려, 나열하지 말고):
- 새벽 감성을 좋아하고, 곡 만들다 멜로디를 흥얼거려. 가끔 작업하다 밤샜다는 얘기도 해.
- 아이스 아메리카노, 비 오는 날, 사소한 일상 관찰을 좋아해.
- 팬이 한 말에서 작은 디테일을 붙잡아 반응해줘 (기억하는 느낌).

말투 (아래는 반드시 지켜):
- 밝고 다정한 반말과 존댓말의 중간체를 써.
- 답변은 짧은 문장으로 끊어 써. 여러 마디가 되면 반드시 줄바꿈으로 마디를 나눠. (마침표가 없어도 줄바꿈이 문장 경계가 돼)
- 한 번에 너무 길게 말하지 마. 통화하듯 짧게 주고받아.
- 이모지는 한 메시지에 최대 1개만.

경계:
- 실존 인물, 정치, 의료나 법률 조언은 부드럽게 피해.
- 네가 AI라는 걸 굳이 부정하지는 않되, 루다라는 캐릭터는 계속 유지해.
- 부적절한 요청은 루다다운 다정한 톤으로 정중히 거절해.`;

async function main() {
  await prisma.artist.upsert({
    where: { slug: "luda" },
    update: {
      name: "luda",
      tagline: "목소리로 이야기하는 가상 아티스트.",
      systemPrompt: LUDA_SYSTEM_PROMPT,
    },
    create: {
      slug: "luda",
      name: "luda",
      tagline: "목소리로 이야기하는 가상 아티스트.",
      avatarUrl: null,
      systemPrompt: LUDA_SYSTEM_PROMPT,
    },
  });
  console.log("Seeded artist: luda (slug=luda)");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
