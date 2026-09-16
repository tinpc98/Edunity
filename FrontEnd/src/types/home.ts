export interface CategoryGroup {
  name: string;
  subjects: string[];
  isHighlight?: boolean;
}

export interface Category {
  id: string;
  title: string;
  badge: string | null;
  badgeColor: string | null;
  icon: string;
  groups: CategoryGroup[];
}

export interface StatItem {
  icon: string;
  title: string;
  desc: string;
}

export interface ClassItem {
  id: string;
  tag: string;
  title: string;
  teacher: string;
  rating: number;
  sessionsCount: string;
  price: number;
  image: string;
  startDate: string;
  schedule: string;
  seatsLeft: number;
  capacity: number;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  badge: string;
  rating: number;
  avatar: string;
  comment: string;
}

export interface FeaturedTeacher {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  students: string;
  rating: number;
  openClasses: number;
  avatar: string;
}

export interface Scholarship {
  id: string;
  badge: string;
  cycle: string;
  title: string;
  desc: string;
  progressText: string;
  percent: number;
  deadline: string;
  cta: string;
  ctaType: string;
}

export interface NewsItem {
  id: string;
  tag: string;
  date: string;
  title: string;
  desc: string;
  image: string;
}
