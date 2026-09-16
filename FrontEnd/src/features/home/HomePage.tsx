import HeroSection from "./components/HeroSection";
import StatsStrip from "./components/StatsStrip";
import THPTSection from "./components/THPTSection";
import THCSSection from "./components/THCSSection";
import FreeClassSection from "./components/FreeClassSection";
import FeaturedTeachersSection from "./components/FeaturedTeachersSection";
import TestimonialSection from "./components/TestimonialSection";
import BecomeTeacherSection from "./components/BecomeTeacherSection";
import ScholarshipSection from "./components/ScholarshipSection";
import NewsSection from "./components/NewsSection";

export default function HomePage() {
  return (
    <main className="site-container pb-12">
      <HeroSection />
      <StatsStrip />
      <THPTSection />
      <THCSSection />
      <FeaturedTeachersSection />
      <FreeClassSection />
      <TestimonialSection />
      <BecomeTeacherSection />
      <ScholarshipSection />
      <NewsSection />
    </main>
  );
}
