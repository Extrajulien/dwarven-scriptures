import Link from 'next/link';
import Icon from '../Icon';
import { LOGIN } from '../../data/NavbarData';

export default function PersonalAccount() {
    const isConnected = false;
    if (isConnected) {
        return (
        <div className="flex items-center gap-space-sm bg-surface-container px-space-sm py-space-xs rounded">
            <div className="text-right hidden sm:block">
              <span className="block font-label-md text-label-md text-on-surface">
                Name
              </span>
              <span className="block font-label-sm text-label-sm text-primary">
                Title
              </span>
            </div>
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Icon name="person" className="text-on-primary text-headline-sm" />
            </div>
          </div>
    );
    }
    return (
          <Link href={`/login`} className={`${LOGIN.button.className} h-8 ps-2 pe-3 rounded-md bg-primary flex items-center justify-center`}>
             <Icon name={LOGIN.button.icon} className="text-headline-sm" />
             {LOGIN.button.label}
          </Link>
    );
}