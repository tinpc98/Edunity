import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import Providers from "./providers";
import Router from "./router";

export default function App() {
  return (
    <Providers>
      <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
        <Header />
        <div className="flex-1">
          <Router />
        </div>
        <Footer />
      </div>
    </Providers>
  );
}