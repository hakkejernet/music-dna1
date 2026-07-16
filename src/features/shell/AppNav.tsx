import { NavLink } from 'react-router-dom';

const linkClassName = ({ isActive }: { isActive: boolean }): string =>
  `app-nav__link${isActive ? ' app-nav__link--active' : ''}`;

export const AppNav = () => (
  <nav className="app-nav">
    <span className="app-nav__brand">Music DNA</span>
    <div className="app-nav__links">
      <NavLink to="/" end className={linkClassName}>
        Discovery
      </NavLink>
      <NavLink to="/music-dna" className={linkClassName}>
        Music DNA
      </NavLink>
    </div>
  </nav>
);
