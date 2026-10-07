import { LOGIN_FOOTER } from '../../data/loginData';

export default function LoginFooter() {
  return (
    <footer className="z-20 w-full border-t border-[#2d271e] bg-[#11100e] px-4 py-3 text-[11px] text-[#716551]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-dwarf-gold">{LOGIN_FOOTER.left}</span>
          <span>{LOGIN_FOOTER.leftNote}</span>
        </div>
        <div className="flex items-center space-x-4 text-[10px]">
          {LOGIN_FOOTER.links.map((link) => (
            <a key={link.href} href={link.href} className={link.className}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
