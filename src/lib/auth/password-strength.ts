export type PasswordStrengthLevel = "weak" | "fair" | "good" | "strong";

export function getPasswordStrength(password: string): {
  level: PasswordStrengthLevel;
  label: string;
  score: number;
} | null {
  if (!password) return null;

  const variety = [/[a-zа-яё]/u, /[A-ZА-ЯЁ]/u, /\d/u, /[^\p{L}\p{N}]/u]
    .filter((pattern) => pattern.test(password)).length;
  let score = 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (variety >= 2) score += 1;
  if (variety >= 3) score += 1;
  if (/(.)\1{2,}/u.test(password) || /(password|qwerty|123456|пароль)/iu.test(password)) {
    score = Math.max(1, score - 1);
  }

  if (score <= 1) return { level: "weak", label: "Простой", score: 1 };
  if (score <= 2) return { level: "fair", label: "Средний", score: 2 };
  if (score <= 4) return { level: "good", label: "Хороший", score: 3 };
  return { level: "strong", label: "Сильный", score: 4 };
}
