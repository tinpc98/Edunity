import { createBrowserRouter, RouterProvider } from "react-router-dom";
import PublicLayout from "../components/layout/PublicLayout";
import HomePage from "../features/home/HomePage";
import ClassDiscoveryPage from "../features/class/ClassDiscoveryPage";
// import ClassDetailPage from "../features/class/pages/ClassDetailPage";
import EnrollmentPage from "../features/enrollment/EnrollmentPage";
import StudentLayout from "../components/layout/StudentLayout";
import StudentHomePage from "../features/student/home/StudentHomePage";
import TeacherLayout from "../components/layout/TeacherLayout";
import TeacherHomePage from "../features/teacher/home/TeacherHomePage";
import TeacherClassesPage from "../features/teacher/classes/TeacherClassesPage";
import CreateTeacherClassPage from "../features/teacher/classes/create/CreateTeacherClassPage";
import TeacherClassDetailPage from "../features/teacher/classes/detail/TeacherClassDetailPage";
import AdminLayout from "../components/layout/AdminLayout";
import AdminHomePage from "../features/admin/home/AdminHomePage";
import TeacherVerificationPage from "../features/admin/teachers/verifications/TeacherVerificationPage";
import TeacherVerificationDetailPage from "../features/admin/teachers/verifications/TeacherVerificationDetailPage";
import AdminCampaignsPage from "../features/admin/campaigns/AdminCampaignsPage";
import CreateCampaignPage from "../features/admin/campaigns/CreateCampaignPage";
import CampaignDetailPage from "../features/admin/campaigns/CampaignDetailPage";
import ScholarshipApplicationsPage from "../features/admin/scholarships/ScholarshipApplicationsPage";
import ScholarshipApplicationReviewPage from "../features/admin/scholarships/ScholarshipApplicationReviewPage";
import SponsorLayout from "../components/layout/SponsorLayout";
import SponsorHomePage from "../features/sponsor/home/SponsorHomePage";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";
import TeacherRegisterPage from "../features/auth/TeacherRegisterPage";
import TeacherQualificationPage from "../features/auth/TeacherQualificationPage";
import TeacherPendingPage from "../features/auth/TeacherPendingPage";
import { ROUTES } from "../routes/routePaths";
import ClassDetailPage from "../features/class/ClassDetailPage";

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
        path: ROUTES.ENROLLMENT,
        element: <EnrollmentPage />,
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
        path: ROUTES.AUTH.TEACHER_QUALIFICATION,
        element: <TeacherQualificationPage />,
      },
      {
        path: ROUTES.AUTH.TEACHER_PENDING,
        element: <TeacherPendingPage />,
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
        element: <CampaignDetailPage />,
      },
      {
        path: "scholarship-applications",
        element: <ScholarshipApplicationsPage />,
      },
      {
        path: "scholarship-applications/:applicationId",
        element: <ScholarshipApplicationReviewPage />,
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
    ],
  },
]);

export default function Router() {
  return <RouterProvider router={router} />;
}