interface RolePillProps {
  role: "admin" | "writer";
}

export function RolePill({ role }: RolePillProps) {
  const styles =
    role === "admin"
      ? "bg-blue-100 text-blue-800"
      : "bg-panel-2 text-text-2";

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles}`}
      data-testid={`role-pill-${role}`}
    >
      {role}
    </span>
  );
}
