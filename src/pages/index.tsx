import { collections } from "@/lib/collections";
import { GetServerSideProps } from "next";

export default function Home() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (collections.length > 0) {
    return {
      redirect: {
        destination: `/${collections[0].slug}/`,
        permanent: false,
      },
    };
  }
  return { props: {} };
};
