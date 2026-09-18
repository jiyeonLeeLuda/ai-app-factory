import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import SignupForm from "@/components/SignupForm";

// 쿠키에 유효한 userId가 있으면 가입을 건너뛰고 리스트로 (p1-spec S1.0)
export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">페르소나 채팅 시작하기</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          닉네임과 이메일만 입력하면 바로 대화할 수 있어요.
        </p>
      </div>
      <SignupForm />
      <p className="text-center text-xs text-black/40 dark:text-white/40">
        비밀번호·로그인은 없어요. 이 브라우저(쿠키)가 곧 당신의 자리예요.
      </p>
    </main>
  );
}
