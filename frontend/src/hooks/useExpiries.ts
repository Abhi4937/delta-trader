import { useQuery } from "@tanstack/react-query";
import { getExpiries, type Expiry } from "../lib/api";

export function useExpiries(underlying: string) {
  return useQuery<Expiry[]>({
    queryKey: ["expiries", underlying],
    queryFn: async () => {
      const res = await getExpiries(underlying);
      return res.expiries;
    },
    staleTime: 5 * 60 * 1000,
  });
}
