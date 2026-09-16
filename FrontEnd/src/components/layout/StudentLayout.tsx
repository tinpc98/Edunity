import { Outlet } from "react-router-dom";

export default function StudentLayout() {
  return (
    <div className="student-layout">
      <Outlet />
    </div>
  );
}
