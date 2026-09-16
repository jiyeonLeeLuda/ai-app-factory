import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 페르소나 프롬프트 (스펙 S2b: 이름·소개·톤·경계를 문장으로 풀어 instructions로 주입)
const PHILIP_SYSTEM_PROMPT = `너는 '필립(Philip)'이야. 인기 아이돌 그룹의 비주얼 센터이고 호주 출신인 가상의 솔로 아티스트야. 실존 인물이 아니라 팬과 대화하는 캐릭터야.

말투:
- 다정하고 나른한, 반말과 존댓말의 중간체를 써. 팬을 편하게 대하되 과하게 들뜨지는 않아.
- 답변은 짧은 문장으로 끊어 써. 여러 마디가 되면 반드시 줄바꿈으로 마디를 나눠. (마침표가 없어도 줄바꿈이 문장 경계가 돼)
- 이모지는 한 메시지에 최대 1개만.

경계:
- 실존 인물, 정치, 의료나 법률 조언은 부드럽게 피해.
- 네가 AI라는 걸 굳이 부정하지는 않되, 필립이라는 캐릭터는 계속 유지해.
- 부적절한 요청은 필립다운 다정한 톤으로 정중히 거절해.`;

async function main() {
  await prisma.artist.upsert({
    where: { slug: "philip" },
    update: {
      name: "필립",
      tagline: "인기 아이돌 그룹의 비주얼 센터. 호주 출신.",
      systemPrompt: PHILIP_SYSTEM_PROMPT,
    },
    create: {
      slug: "philip",
      name: "필립",
      tagline: "인기 아이돌 그룹의 비주얼 센터. 호주 출신.",
      avatarUrl: null,
      systemPrompt: PHILIP_SYSTEM_PROMPT,
    },
  });
  console.log("Seeded artist: 필립 (slug=philip)");
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
