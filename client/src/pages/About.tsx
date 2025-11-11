import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import LandingNav from "@/components/LandingNav";
import Footer from "@/components/Footer";
import { Target, Zap, Globe, Users } from "lucide-react";

export default function About() {
  return (
    <div className="min-h-screen">
      <LandingNav />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">
              Building the Future of Accounting Intelligence
            </h1>
            <p className="text-xl text-muted-foreground">
              We're on a mission to transform accounting from a compliance burden into a strategic advantage
              through specialized AI and advanced financial algorithms.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl font-bold">Our Mission</h2>
              <p className="text-lg text-muted-foreground">
                Luca exists to democratize access to world-class accounting expertise. We believe every 
                business deserves sophisticated tax planning, audit intelligence, and financial analysis—
                not just Fortune 500 companies.
              </p>
              <p className="text-lg text-muted-foreground">
                By combining specialized AI models with advanced financial solvers, we're creating an 
                accounting superintelligence that surpasses traditional software and delivers actual 
                calculations, multi-domain expertise, and real-time insights.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <Card className="p-6 space-y-3">
                <Target className="w-8 h-8 text-primary" />
                <h3 className="font-semibold">Purpose-Driven</h3>
                <p className="text-sm text-muted-foreground">
                  Building tools that solve real accounting challenges
                </p>
              </Card>
              <Card className="p-6 space-y-3">
                <Zap className="w-8 h-8 text-primary" />
                <h3 className="font-semibold">Innovation First</h3>
                <p className="text-sm text-muted-foreground">
                  Leveraging cutting-edge AI for superior results
                </p>
              </Card>
              <Card className="p-6 space-y-3">
                <Globe className="w-8 h-8 text-primary" />
                <h3 className="font-semibold">Global Reach</h3>
                <p className="text-sm text-muted-foreground">
                  Pan-global compliance across 6 markets
                </p>
              </Card>
              <Card className="p-6 space-y-3">
                <Users className="w-8 h-8 text-primary" />
                <h3 className="font-semibold">User-Centric</h3>
                <p className="text-sm text-muted-foreground">
                  Designed by accountants, for accountants
                </p>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 space-y-8">
          <h2 className="text-4xl font-bold text-center">Our Story</h2>
          <div className="prose prose-lg dark:prose-invert mx-auto">
            <p className="text-muted-foreground">
              Luca was born from a simple frustration: existing accounting software forces professionals 
              to do the heavy lifting. You input data, manually reconcile discrepancies, and still need 
              to consult expensive specialists for complex scenarios.
            </p>
            <p className="text-muted-foreground">
              We asked: what if accounting software could actually think? What if it could model tax 
              scenarios across jurisdictions, detect anomalies proactively, and generate audit-ready 
              deliverables instantly?
            </p>
            <p className="text-muted-foreground">
              That vision became Luca—a platform that doesn't just store your data, but actively analyzes, 
              predicts, and optimizes your financial strategy using the same AI breakthroughs powering 
              ChatGPT and AlphaFold.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center mb-16">Our Values</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 space-y-4">
              <h3 className="text-2xl font-semibold">Accuracy First</h3>
              <p className="text-muted-foreground">
                Financial decisions demand precision. We validate every calculation and cite our sources, 
                ensuring you can trust Luca's recommendations with confidence.
              </p>
            </Card>
            <Card className="p-8 space-y-4">
              <h3 className="text-2xl font-semibold">Transparent AI</h3>
              <p className="text-muted-foreground">
                You deserve to understand how conclusions are reached. Luca shows its work, explains 
                its reasoning, and gives you full control over AI-assisted decisions.
              </p>
            </Card>
            <Card className="p-8 space-y-4">
              <h3 className="text-2xl font-semibold">Continuous Innovation</h3>
              <p className="text-muted-foreground">
                The accounting landscape evolves rapidly. We stay ahead with regular updates to tax codes, 
                compliance requirements, and AI capabilities across all markets.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-4xl font-bold">Join Our Mission</h2>
          <p className="text-lg text-muted-foreground">
            Whether you're a solo practitioner or part of a large firm, Luca gives you the intelligence 
            of a team of specialists at your fingertips.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/auth">
              <Button size="lg" data-testid="button-get-started">
                Get Started Free
              </Button>
            </Link>
            <Link href="/careers">
              <Button size="lg" variant="outline" data-testid="button-view-careers">
                View Careers
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
