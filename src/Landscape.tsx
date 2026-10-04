import backgroundA from '../docs/overworld_backgroud_a.png';
import backgroundB from '../docs/overworld_background_b.png';
export function Landscape() {
  return (
    <picture className="landscape" aria-hidden="true">
      <source media="(max-width: 1100px)" srcSet={backgroundA} />
      <img src={backgroundB} alt="" />
    </picture>
  );
}
