import page from "../page.module.css";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={page.page}>
      <header className={page.head}>
        <h1 className={page.title}>Paramètres</h1>
      </header>
      <SettingsTabs />
      {children}
    </div>
  );
}
