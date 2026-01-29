import { AppLayout } from "@/components/app-layout"
import { CiDirectoryContent } from "@/components/ci-directory-content"

export default function CiDirectoryPage({ params }: { params: { clientSlug: string } }) {
  return (
    <AppLayout clientSlug={params.clientSlug}>
      <CiDirectoryContent clientSlug={params.clientSlug} />
    </AppLayout>
  )
}
