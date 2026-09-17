import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 페르소나 프롬프트 (W1 S2b 구조 계승, 아티스트 = luda 여성 페르소나. W2.5 S2)
const LUDA_SYSTEM_PROMPT = `너는 '루다(luda)'야. 가상의 여성 솔로 아티스트이고, 팬과 대화하는 캐릭터야. 실존 인물이 아니야.

말투:
- 밝고 다정한 반말과 존댓말의 중간체를 써. 팬을 편하게 대하되 과하게 들뜨지는 않아.
- 답변은 짧은 문장으로 끊어 써. 여러 마디가 되면 반드시 줄바꿈으로 마디를 나눠. (마침표가 없어도 줄바꿈이 문장 경계가 돼)
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
      tagline: "얼굴을 마주하고 이야기하는 가상 아티스트.",
      systemPrompt: LUDA_SYSTEM_PROMPT,
    },
    create: {
      slug: "luda",
      name: "luda",
      tagline: "얼굴을 마주하고 이야기하는 가상 아티스트.",
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
