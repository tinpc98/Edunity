import HeroSection from "../components/home/HeroSection";
import StatsStrip from "../components/home/StatsStrip";
import THPTSection from "../components/home/THPTSection";
import THCSSection from "../components/home/THCSSection";
import FreeClassSection from "../components/home/FreeClassSection";
import FeaturedTeachersSection from "../components/home/FeaturedTeachersSection";
import TestimonialSection from "../components/home/TestimonialSection";
import BecomeTeacherSection from "../components/home/BecomeTeacherSection";
import ScholarshipSection from "../components/home/ScholarshipSection";
import NewsSection from "../components/home/NewsSection";

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
