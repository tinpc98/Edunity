import { createBrowserRouter, RouterProvider } from "react-router-dom";
import PublicLayout from "../components/layout/PublicLayout";
import HomePage from "../features/home/HomePage";
import StudentLayout from "../components/layout/StudentLayout";
import StudentHomePage from "../features/student/home/StudentHomePage";
import TeacherLayout from "../components/layout/TeacherLayout";
import TeacherHomePage from "../features/teacher/home/TeacherHomePage";
import AdminLayout from "../components/layout/AdminLayout";
import AdminHomePage from "../features/admin/home/AdminHomePage";
import SponsorLayout from "../components/layout/SponsorLayout";
import SponsorHomePage from "../features/sponsor/home/SponsorHomePage";
import { ROUTES } from "../routes/routePaths";

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      {
        path: ROUTES.HOME,
        element: <HomePage />,
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