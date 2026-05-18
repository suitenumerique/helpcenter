import { fr } from "@codegouvfr/react-dsfr";
import Link from "next/link";

export default function Error500() {
  return (
    <div className={fr.cx("fr-my-6w", "fr-container")}>
      <h1>Erreur 500</h1>
      <p>Une erreur s&rsquo;est produite lors du chargement de la page.</p>
      <p>
        <Link className={fr.cx("fr-link")} href="/">
          Retour à l&rsquo;accueil
        </Link>
      </p>
    </div>
  );
}
