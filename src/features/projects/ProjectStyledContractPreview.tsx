import { CONTRACT_PAGE_SIZE, type StyledContractDocument } from './projectStyledContract';

export function ProjectStyledContractPreview({ document, page, signatureUrl }: {
  document: StyledContractDocument;
  page: number;
  signatureUrl?: string;
}) {
  return (
    <svg
      aria-label={`${document.title}, page ${page}`}
      className="project-styled-contract-document"
      role="img"
      viewBox={`0 0 ${CONTRACT_PAGE_SIZE.width} ${CONTRACT_PAGE_SIZE.height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#ffffff" height={CONTRACT_PAGE_SIZE.height} width={CONTRACT_PAGE_SIZE.width} />
      {document.pages[page - 1]?.map((item, index) => {
        if (item.type === 'circle') return <circle cx={item.x} cy={item.y} fill={item.fill} key={index} r={item.radius} />;
        if (item.type === 'rect') return <rect fill={item.fill} height={item.height} key={index} stroke={item.stroke} strokeWidth={0.5} width={item.width} x={item.x} y={item.y} />;
        if (item.type === 'image') return <image height={item.height} href={item.source === 'logo' ? '/bbtm-report-logo.png' : signatureUrl} key={index} preserveAspectRatio="xMinYMid meet" width={item.width} x={item.x} y={item.y} />;
        return <text fill={item.color} fontFamily="Arial, Helvetica, sans-serif" fontSize={item.size} fontWeight={item.weight === 'bold' ? 700 : 400} key={index}>
          {item.lines.map((line, lineIndex) => <tspan key={lineIndex} x={item.x} y={item.y + item.size + lineIndex * item.leading}>{line}</tspan>)}
        </text>;
      })}
    </svg>
  );
}
