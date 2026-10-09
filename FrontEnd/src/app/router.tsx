import { createBrowserRouter, RouterProvider } from "react-router-dom";
import PublicLayout from "../components/layout/PublicLayout";
import HomePage from "../features/home/HomePage";
import ClassDiscoveryPage from "../features/class/ClassDiscoveryPage";
// import ClassDetailPage from "../features/class/pages/ClassDetailPage";
import CheckoutPage from "../features/enrollment/CheckoutPage";
import PaymentSuccessPage from "../features/enrollment/PaymentSuccessPage";
import EnrollmentPage from "../features/enrollment/EnrollmentPage";
import StudentLayout from "../components/layout/StudentLayout";
import StudentHomePage from "../features/student/home/StudentHomePage";
import StudentClassSessionsPage from "../features/student/classes/StudentClassSessionsPage";
import StudentSchedulePage from "../features/student/schedule/StudentSchedulePage";
import StudentEnrollmentsPage from "../features/student/enrollments/StudentEnrollmentsPage";
import StudentProfilePage from "../features/student/profile/StudentProfilePage";
import TeacherLayout from "../components/layout/TeacherLayout";
import TeacherHomePage from "../features/teacher/home/TeacherHomePage";
import TeacherClassesPage from "../features/teacher/classes/TeacherClassesPage";
import CreateTeacherClassPage from "../features/teacher/classes/create/CreateTeacherClassPage";
import TeacherClassDetailPage from "../features/teacher/classes/detail/TeacherClassDetailPage";
import TeacherProfilePage from "../features/teacher/profile/TeacherProfilePage";
import AdminLayout from "../components/layout/AdminLayout";
import AdminHomePage from "../features/admin/home/AdminHomePage";
import TeacherVerificationPage from "../features/admin/teachers/verifications/TeacherVerificationPage";
import TeacherVerificationDetailPage from "../features/admin/teachers/verifications/TeacherVerificationDetailPage";
import AdminCampaignsPage from "../features/admin/campaigns/AdminCampaignsPage";
import CreateCampaignPage from "../features/admin/campaigns/CreateCampaignPage";
import AdminCampaignDetailPage from "../features/admin/campaigns/CampaignDetailPage";
import CampaignsPage from "../features/campaign/CampaignsPage";
import PublicCampaignDetailPage from "../features/campaign/CampaignDetailPage";
import SponsorContributionsPage from "../features/sponsor/contributions/SponsorContributionsPage";
import ScholarshipApplicationsPage from "../features/admin/scholarships/ScholarshipApplicationsPage";
import ScholarshipApplicationReviewPage from "../features/admin/scholarships/ScholarshipApplicationReviewPage";
import SponsorLayout from "../components/layout/SponsorLayout";
import SponsorHomePage from "../features/sponsor/home/SponsorHomePage";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import TeacherRegisterPage from "../features/auth/TeacherRegisterPage";
import { ROUTES } from "../routes/routePaths";
import ClassDetailPage from "../features/class/ClassDetailPage";
import CoursesPage from "../features/course/CoursesPage";
import CourseDetailPage from "../features/course/CourseDetailPage";
import TeacherCourseCatalogPage from "../features/teacher/courses/TeacherCourseCatalogPage";
import TeacherCourseProposalsPage from "../features/teacher/courses/TeacherCourseProposalsPage";
import TeacherSchedulePage from "../features/teacher/schedule/TeacherSchedulePage";
import AdminCatalogPage from "../features/admin/catalog/AdminCatalogPage";
import AdminCourseProposalsPage from "../features/admin/catalog/AdminCourseProposalsPage";
import AdminClassesPage from "../features/admin/classes/AdminClassesPage";
import AdminClassDetailPage from "../features/admin/classes/AdminClassDetailPage";
import StudentPaymentsPage from "../features/student/payments/StudentPaymentsPage";
import StudentScholarshipsPage from "../features/student/scholarships/StudentScholarshipsPage";
import StudentScholarshipApplicationsPage from "../features/student/scholarships/StudentScholarshipApplicationsPage";
import TeacherRevenuePage from "../features/teacher/revenue/TeacherRevenuePage";
import AdminPaymentsPage from "../features/admin/finance/AdminPaymentsPage";
import AdminTransactionsPage from "../features/admin/finance/AdminTransactionsPage";
import ClassroomPage from "../features/classroom/ClassroomPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { MessagesPage } from "../features/messages/MessagesPage";
import { MyReportsPage } from "../features/reports/MyReportsPage";
import { TeacherReviewsPage } from "../features/teacher/reviews/TeacherReviewsPage";
import { AdminReportsPage } from "../features/admin/reports/AdminReportsPage";

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      {
        path: ROUTES.HOME,
        element: <HomePage />,
      },
      {
        path: ROUTES.CLASSES,
        element: <ClassDiscoveryPage />,
      },
      {
        path: ROUTES.CLASS_DETAIL,
        element: <ClassDetailPage />,
      },
      {
        path: ROUTES.COURSES.LIST,
        element: <CoursesPage />,
      },
      {
        path: ROUTES.COURSE_DETAIL,
        element: <CourseDetailPage />,
      },
      {
        path: ROUTES.ENROLLMENT,
        element: <EnrollmentPage />,
      },
      {
        path: ROUTES.CHECKOUT,
        element: <CheckoutPage />,
      },
      {
        path: ROUTES.PAYMENT_SUCCESS,
        element: <PaymentSuccessPage />,
      },
      {
        path: ROUTES.AUTH.REGISTER,
        element: <RegisterPage />,
      },
      {
        path: ROUTES.AUTH.LOGIN,
        element: <LoginPage />,
      },
      {
        path: ROUTES.AUTH.TEACHER_REGISTER,
        element: <TeacherRegisterPage />,
      },
      {
        path: ROUTES.CAMPAIGNS,
        element: <CampaignsPage />,
      },
      {
        path: ROUTES.CAMPAIGN_DETAIL,
        element: <PublicCampaignDetailPage />,
      },
      {
        path: ROUTES.NOTIFICATIONS,
        element: <NotificationsPage />,
      },
      {
        path: ROUTES.MESSAGES,
        element: <MessagesPage />,
      },
      {
        path: ROUTES.REPORTS,
        element: <MyReportsPage />,
      },
    ],
  },
  {
    path: ROUTES.STUDENT.HOME,
    element: <StudentLayout />,
    children: [
      {
        index: true,
        element: <StudentHomePage />,
      },
      {
        path: "classes/:classId",
        element: <StudentClassSessionsPage />,
      },
      {
        path: "schedule",
        element: <StudentSchedulePage />,
      },
      {
        path: "enrollments",
        element: <StudentEnrollmentsPage />,
      },
      {
        path: "profile",
        element: <StudentProfilePage />,
      },
      {
        path: "payments",
        element: <StudentPaymentsPage />,
      },
      {
        path: "scholarships",
        element: <StudentScholarshipsPage />,
      },
      {
        path: "scholarships/applications",
        element: <StudentScholarshipApplicationsPage />,
      },
    ],
  },
  {
    path: ROUTES.TEACHER.HOME,
    element: <TeacherLayout />,
    children: [
      {
        index: true,
        element: <TeacherHomePage />,
      },
      {
        path: "classes",
        element: <TeacherClassesPage />,
      },
      {
        path: "classes/create",
        element: <CreateTeacherClassPage />,
      },
      {
        path: "classes/:classId",
        element: <TeacherClassDetailPage />,
      },
      {
        path: "courses",
        element: <TeacherCourseCatalogPage />,
      },
      {
        path: "course-proposals",
        element: <TeacherCourseProposalsPage />,
      },
      {
        path: "schedule",
        element: <TeacherSchedulePage />,
      },
      {
        path: "profile",
        element: <TeacherProfilePage />,
      },
      {
        path: "revenue",
        element: <TeacherRevenuePage />,
      },
      {
        path: "reviews",
        element: <TeacherReviewsPage />,
      },
    ],
  },
  {
    path: ROUTES.ADMIN.HOME,
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <AdminHomePage />,
      },
      {
        path: "classes",
        element: <AdminClassesPage />,
      },
      {
        path: "classes/:classId",
        element: <AdminClassDetailPage />,
      },
      {
        path: "catalog",
        element: <AdminCatalogPage />,
      },
      {
        path: "course-proposals",
        element: <AdminCourseProposalsPage />,
      },
      {
        path: "teachers/verifications",
        element: <TeacherVerificationPage />,
      },
      {
        path: "teachers/verifications/:teacherId",
        element: <TeacherVerificationDetailPage />,
      },
      {
        path: "campaigns",
        element: <AdminCampaignsPage />,
      },
      {
        path: "campaigns/create",
        element: <CreateCampaignPage />,
      },
      {
        path: "campaigns/:campaignId",
        element: <AdminCampaignDetailPage />,
      },
      {
        path: "scholarship-applications",
        element: <ScholarshipApplicationsPage />,
      },
      {
        path: "scholarship-applications/:applicationId",
        element: <ScholarshipApplicationReviewPage />,
      },
      {
        path: "payments",
        element: <AdminPaymentsPage />,
      },
      {
        path: "transactions",
        element: <AdminTransactionsPage />,
      },
      {
        path: "reports",
        element: <AdminReportsPage />,
      },
    ],
  },
  {
    path: ROUTES.SPONSOR.HOME,
    element: <SponsorLayout />,
    children: [
      {
        index: true,
        element: <SponsorHomePage />,
      },
      {
        path: "contributions",
        element: <SponsorContributionsPage />,
      },
    ],
  },
  {
    path: ROUTES.CLASSROOM,
    element: <ClassroomPage />,
  },
]);


export default function Router() {
  return <RouterProvider router={router} />;
}