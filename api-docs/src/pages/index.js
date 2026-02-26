import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import Heading from '@theme/Heading';
import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)} style={{ backgroundColor: '#1a365d' }}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/api-reference">
            Ver Referencia de la API 🚀
          </Link>
        </div>
      </div>
    </header>
  );
}

function ApiFeatures() {
  return (
    <section style={{ padding: '4rem 0' }}>
      <div className="container">
        <div className="row">
          <div className="col col--4" style={{ textAlign: 'center' }}>
            <h3>Extracción de Idealista, Fotocasa y más</h3>
            <p>Conéctate a múltiples portales inmobiliarios desde un solo lugar utilizando nuestra API unificada robusta.</p>
          </div>
          <div className="col col--4" style={{ textAlign: 'center' }}>
            <h3>Webhooks Asíncronos</h3>
            <p>Diseñado para flujos de trabajo en n8n y Make. Envíamos los datos limpios directamente a tu webhook cuando el scraper termina, esquivando timeouts de Cloudflare.</p>
          </div>
          <div className="col col--4" style={{ textAlign: 'center' }}>
            <h3>Evasión de Antibots (Stealth)</h3>
            <p>Utilizamos Playwright con evasión avanzada y proxies residenciales para extraer listados sin bloqueos.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Inicio | ${siteConfig.title}`}
      description="Documentación oficial de la API de web scraping para portales inmobiliarios.">
      <HomepageHeader />
      <main>
        <ApiFeatures />
      </main>
    </Layout>
  );
}
