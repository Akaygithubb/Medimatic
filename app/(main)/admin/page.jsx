import { getPendingDoctors, getPendingPayouts, getVerifiedDoctors } from "@/actions/admin";
import { TabsContent } from "@/components/ui/tabs";
import React from "react";
import PendingDoctors from "./_components/pending-doctors";

import { PendingPayouts } from "./_components/pending-payouts";
import { VerifiedDoctors } from "./_components/verified-doctors";


const AdminPage = async () => {
  const [pendingDoctorsData, verifiedDoctorsData,pendingPayoutsData] = await Promise.all([
    getPendingDoctors(),
    getVerifiedDoctors(),
    getPendingPayouts(),
  ]);
  return (
    <>
      <TabsContent value="pending" className="border-none p-0">
        <PendingDoctors doctors={pendingDoctorsData.doctors || []} />
      </TabsContent>
      <TabsContent value="doctors" className="border-none p-0">
        <VerifiedDoctors doctors={verifiedDoctorsData.doctors || []} />
      </TabsContent>

      <TabsContent value="payouts" className="border-none p-0">
        <PendingPayouts payouts={pendingPayoutsData.payouts || []} />
      </TabsContent>
    </>
  );
};

export default AdminPage;
