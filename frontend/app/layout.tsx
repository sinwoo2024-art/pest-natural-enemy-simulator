import "@fontsource-variable/noto-sans-kr";
import "./globals.css";
import "./enhancements.css";
import { InitialPageDataProvider } from "./initial-page-context";
import { getInitialPageData } from "./server-initial-page-data";

export const metadata = {
  title: "공생의 알고리즘 AI",
  description: "AI 기반 천적곤충 활용 병해충 대응 시뮬레이터",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const initialPageData = await getInitialPageData();
  return (
    <html lang="ko">
      <body>
        <InitialPageDataProvider value={initialPageData}>{children}</InitialPageDataProvider>
      </body>
    </html>
  );
}
