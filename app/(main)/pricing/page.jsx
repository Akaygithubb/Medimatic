import Pricing from "@/components/pricing";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import React from "react";

const PricingPage = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex justify-start mb-2">
        <Link
          href="/"
          className="flex items-center text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Link>
      </div>
      <div className="max-w-full mx-auto mb-12 text-center">
        <Badge
          variant="outline"
          className="bg-emerald-900/30 border-emerald-700/30 px-4 py-1 text-emerald-400 text-sm font-medium mb-4"
        >
          Affordable Healthcare for Everyone
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold gradient-title mb-4">
          Simple and Transparent Pricing
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          At Medimatic, we believe in making healthcare accessible to all. Our
          pricing is designed to be straightforward and affordable, ensuring you
          get the best care without breaking the bank. Whether you're a patient
          or a healthcare provider, our plans are tailored to meet your needs.
        </p>
        <Pricing/>
        <div className="max-w-3xl mx-auto mt-16 text-center">
            <h2 className="text-2xl font-bold text-white mb-2">
                Questions? We're here to help!
            </h2>
            <p className="text-muted-foreground mb-4">
                Contact our support team at support@medimatic.com
            </p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
