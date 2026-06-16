// Кнопка навигации в боковом меню.
export function NavButton({ page, setPage, value, icon, label, onNavigate }: any) {
  return (
    <button
      className={`nav-button ${page === value ? 'active' : ''}`}
      onClick={() => {
        setPage(value);
        onNavigate?.();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
