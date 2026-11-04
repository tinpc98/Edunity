import HeroSection from "./components/HeroSection";
import StatsStrip from "./components/StatsStrip";
import THPTSection from "./components/THPTSection";
import THCSSection from "./components/THCSSection";
import FreeClassSection from "./components/FreeClassSection";
import FeaturedTeachersSection from "./components/FeaturedTeachersSection";
import BecomeTeacherSection from "./components/BecomeTeacherSection";
import ScholarshipSection from "./components/ScholarshipSection";

// TestimonialSection and NewsSection are not rendered: their content (data/homeData.ts) is placeholder text with
// invented people and news. Re-add them once they are fed by real reviews / articles.
export default function HomePage() {
  return (
    <main className="site-container pb-12">
      <HeroSection />
      <StatsStrip />
      <THPTSection />
      <THCSSection />
      <FeaturedTeachersSection />
      <FreeClassSection />
      <BecomeTeacherSection />
      <ScholarshipSection />
    </main>
  );
}
