import { getSiteForHost } from "@/lib/sites";
import { GetServerSideProps } from "next";

export default function Home() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const site = getSiteForHost(req.headers.host);
  if (!site || site.collections.length === 0) {
    return { notFound: true };
  }
  return {
    redirect: {
      destination: `/${site.collections[0].slug}/`,
      permanent: false,
    },
  };
};
