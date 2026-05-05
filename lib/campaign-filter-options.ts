// Shared filter constants used by both the server page (Prisma query) and
// the client filter bar component. Kept in a plain .ts file with no
// "use client" / "use server" directive so both can import it safely.

export const STATES = [
  "AK","AL","AR","AZ","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL",
  "IN","KS","KY","LA","MA","MD","ME","MI","MN","MO","MS","MT","NC","ND","NE",
  "NH","NJ","NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VA","VT","WA","WI","WV","WY",
]

export const PARTIES = [
  { value: "republican",  label: "Republican"  },
  { value: "democrat",    label: "Democrat"    },
  { value: "independent", label: "Independent" },
]

// Office values are text-matched against the `office` column
// (e.g. "U.S. House — FL-14"). The `match` string is what we look for
// with a case-insensitive `contains` in Prisma.
export const OFFICES = [
  { value: "house",     label: "U.S. House",     match: "U.S. House"     },
  { value: "senate",    label: "U.S. Senate",    match: "U.S. Senate"    },
  { value: "president", label: "U.S. President", match: "President"      },
]
