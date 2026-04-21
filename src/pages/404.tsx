import { fr } from "@codegouvfr/react-dsfr";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className={fr.cx("fr-my-6w", "fr-container")}>
      <h1>Erreur 404</h1>
      <p>La page demandée n&rsquo;a pas été trouvée.</p>
      <p>
        <Link className={fr.cx("fr-link")} href="/">
          Retour à l&rsquo;accueil
        </Link>
      </p>
    </div>
  );
}
