import Providers from "./providers";
import Router from "./router";

export default function App() {
  return (
    <Providers>
      <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
        <Router />
      </div>
    </Providers>
  );
}