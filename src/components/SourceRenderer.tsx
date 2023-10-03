import React from 'react';
import { AnswerSource } from '../generated/backendclient';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsViewer from 'pdfjs-dist/web/pdf_viewer';
import 'pdfjs-dist/web/pdf_viewer.css';
import styles from './SourceRenderer.module.css';
import classnames from 'classnames';
import arrow from '../icons/arrow_up_left.svg';
import { ScoreView } from './ScoreView';

interface Props {
  document_urls: { [document_id: string]: string };
  sources: AnswerSource[];
  className?: string;
  workerSrc?: string;
  showSourceText?: boolean;
  allowOpenPdf?: boolean;
}

export function SourceRenderer({
  document_urls,
  sources,
  className,
  workerSrc,
  showSourceText,
  allowOpenPdf,
}: Props) {
  const [pdfDialogPdfUrl, setPdfDialogPdfUrl] = React.useState<
    string | undefined
  >(undefined);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [showPdfDialog, setShowPdfDialog] = React.useState<boolean>(false);
  const [isFindingDetailView, setIsFindingDetailView] = React.useState<boolean>(
    true
  );
  const [pageOfDetailView, setPageOfDetailView] = React.useState<
    number | undefined
  >(undefined);

  const [pdfs, setPdfs] = React.useState<
    { [document_id: string]: pdfjsLib.PDFDocumentProxy } | undefined
  >();
  const [isPDFPreviewLoaded, setIsPDFPreviewLoaded] = React.useState<boolean[]>(
    () => sources.map(() => false)
  );
  const [hasPDFPreviewErrored, setHasPDFPreviewErrored] = React.useState<
    boolean[]
  >(() => sources.map(() => false));
  const sourcesContainerRef = React.useRef<HTMLDivElement>(null);
  const outsideContainerRef = React.useRef<HTMLDivElement>(null);

  const orderedSources = React.useMemo(
    () =>
      sources.sort((a, b) => {
        if (a.source_section.document_id === b.source_section.document_id) {
          return -1 * (a.score - b.score);
        } else {
          return -1;
        }
      }),
    [sources]
  );

  const createNodes = React.useCallback(
    (
      node: HTMLDivElement | null,
      loadedPdfs: { [document_id: string]: pdfjsLib.PDFDocumentProxy },
      orderedSources: AnswerSource[]
    ) => {
      if (node == null || loadedPdfs == null) {
        console.error(
          'Skipping createNodes because node or loadedPdfs is null',
          loadedPdfs,
          node
        );
        return;
      }

      orderedSources.forEach((source, index) => {
        const pdfDocument: pdfjsLib.PDFDocumentProxy =
          loadedPdfs[source.source_section.document_id];
        if (pdfDocument == null) {
          console.error(
            'Could not find pdf document for document_id when creating nodes: ',
            source.source_section.document_id,
            loadedPdfs
          );
          setHasPDFPreviewErrored(prev => {
            const newPdfErroredState = [...prev];
            newPdfErroredState[index] = true;
            return newPdfErroredState;
          });

          return;
        }

        const canvas = (node.children[index] as HTMLDivElement).querySelector(
          '.pdf-source-preview-canvas'
        ) as HTMLDivElement;
        renderSourceView(
          pdfDocument,
          canvas,
          source.source_section.text,
          () => {
            setIsPDFPreviewLoaded(prev => {
              const newPdfLoadedState = [...prev];
              newPdfLoadedState[index] = true;
              return newPdfLoadedState;
            });
          }
        );
      });
    },
    []
  );

  React.useEffect(() => {
    const controller = new AbortController();

    const load = async (document_ids: string[]) => {
      let loadedPdfs: { [key: string]: pdfjsLib.PDFDocumentProxy } = {};

      try {
        const allPdfs = await Promise.all(
          document_ids.map(async document_id => {
            const document_url = document_urls[document_id];
            if (document_url == null) {
              console.error(
                'Could not find document_url for document_id: ',
                document_id
              );
              return;
            }
            return loadPDF(document_url);
          })
        );

        document_ids.forEach((document_id, index) => {
          const pdf = allPdfs[index];
          if (pdf == null) {
            console.error(
              'Could not find pdf document for document_id when loading: ',
              document_id,
              allPdfs
            );
            return;
          }
          loadedPdfs[document_id] = pdf;
        });

        return loadedPdfs;
      } catch (e) {
        console.error(e);
        return {};
      }
    };

    if (
      pdfjsLib.GlobalWorkerOptions.workerSrc == null ||
      pdfjsLib.GlobalWorkerOptions.workerSrc.length === 0
    ) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        workerSrc != null
          ? workerSrc
          : `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;
    }

    if (sourcesContainerRef.current != null) {
      const documentIds = new Set(
        orderedSources.map(source => source.source_section.document_id)
      );
      const loadedDocumentIds = new Set(Object.keys(pdfs || {}));

      setIsLoading(true);

      const documentsIdToLoad = Array.from(documentIds).filter(
        id => !Array.from(loadedDocumentIds).includes(id)
      );

      load(documentsIdToLoad).then(loadedPdfs => {
        let allPdfs = {};
        setPdfs(prev => {
          allPdfs = { ...(prev || {}), ...loadedPdfs };
          return { ...(prev || {}), ...loadedPdfs };
        });

        // Wait until the sources container is rendered before creating nodes
        const createNodesInterval = setInterval(() => {
          if (controller.signal.aborted) {
            clearInterval(createNodesInterval);
            setIsLoading(false);
          }

          if (sourcesContainerRef.current != null) {
            clearInterval(createNodesInterval);
            createNodes(sourcesContainerRef.current, allPdfs, orderedSources);
            setIsLoading(false);
          }
        }, 100);
      });
    }

    return () => {
      controller.abort();
    };
  }, [workerSrc, sourcesContainerRef, orderedSources]);

  const onShowDetail = React.useCallback(
    (index: number) => {
      if (
        !isPDFPreviewLoaded[index] ||
        pdfs == null ||
        outsideContainerRef.current == null
      ) {
        return;
      }
      setIsFindingDetailView(true);
      setShowPdfDialog(true);

      const node = outsideContainerRef.current.querySelector(
        '.viewerContainer'
      ) as HTMLDivElement;
      if (node == null) {
        return;
      }
      const document_id = orderedSources[index].source_section.document_id;
      const pdf = pdfs[document_id];
      setPdfDialogPdfUrl(document_urls[document_id]);
      if (pdf == null) {
        console.error(
          'Could not find pdf document for document_id: ',
          document_id,
          pdfs
        );
        return;
      }

      renderSourceView(
        pdf,
        node,
        sources[index].source_section.text,
        pageNumber => {
          setIsFindingDetailView(false);
          setPageOfDetailView(pageNumber);
        },
        node.childNodes[0] as HTMLDivElement
      );
    },
    [isPDFPreviewLoaded, pdfs, sources]
  );

  const hidePdfDialog = React.useCallback(() => {
    if (outsideContainerRef.current == null) {
      return;
    }

    setPdfDialogPdfUrl(undefined);
    setShowPdfDialog(false);
    outsideContainerRef.current
      .querySelector('.viewerContainer')
      ?.childNodes[0].remove();
    outsideContainerRef.current
      .querySelector('.viewerContainer')
      ?.appendChild(document.createElement('div'));
  }, []);

  return (
    <div className={classnames(className)} ref={outsideContainerRef}>
      {isLoading ? (
        <div className={styles.animateBounce}>Loading sources...</div>
      ) : (
        undefined
      )}
      <div>
        <div
          id="pdfDialogOverlay"
          className={`${styles.pdfDialogOverlay} ${
            showPdfDialog ? '' : styles.hidden
          }`}
        >
          <div
            id="pdfDialogBackground"
            className={styles.pdfDialogBackground}
            onClick={hidePdfDialog}
          ></div>
          <div id="dialogBody" className={styles.pdfDialogBody}>
            {isFindingDetailView === true && (
              <div
                className={classnames(
                  styles.pdfDialogSearchBar,
                  styles.animatePulse
                )}
              >
                Searching pdf ...
              </div>
            )}
            {(allowOpenPdf == null || allowOpenPdf === true) && (
              <button
                className={classnames(styles.pdfDialogOpenDocumentButton)}
                title="Open PDF"
                onClick={() => {
                  if (pdfDialogPdfUrl == null) {
                    return;
                  }
                  window.open(
                    pdfDialogPdfUrl +
                      (pageOfDetailView != null
                        ? `#page=${pageOfDetailView}`
                        : ''),
                    '_blank'
                  );
                }}
              >
                <img src={arrow} title="arrow left" height="16px" />
              </button>
            )}
            <div
              className={classnames(
                'viewerContainer',
                styles.pdfDialogViewerContainer
              )}
            >
              <div className="viewer"></div>
            </div>
          </div>
        </div>
        <div ref={sourcesContainerRef} className="sourcearea">
          {orderedSources.map((source, index) => (
            <div
              key={index}
              className={classnames('source-entry', styles.sourceEntry)}
            >
              {showSourceText === true && (
                <div>{source.source_section.text}</div>
              )}
              <div
                className={classnames(
                  'pdf-source-preview',
                  styles.sourceDetail
                )}
                onClick={() => {
                  onShowDetail(index);
                }}
              >
                <div
                  className={classnames(
                    'pdf-source-preview-canvas',
                    styles.sourceDetailRenderContainer
                  )}
                  title={source.source_section.starting_text}
                >
                  <div></div>
                </div>
              </div>
              {!hasPDFPreviewErrored[index] &&
                isPDFPreviewLoaded[index] === false && (
                  <div className={styles.sourceDetailLoading}>
                    <p className={styles.animatePulse}>Loading pdf ...</p>
                  </div>
                )}
              {hasPDFPreviewErrored[index] && (
                <div className={styles.sourceDetailLoading}>
                  <p>
                    Failed ot load pdf for source: {source.source_section.text}
                  </p>
                </div>
              )}
              <ScoreView score={source.score} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function loadPDF(
  document_url: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  return await pdfjsLib.getDocument({
    url: document_url,
    withCredentials: true,
  }).promise;
}

function renderSourceView(
  pdfDocument: pdfjsLib.PDFDocumentProxy,
  element: HTMLDivElement,
  searchString: string,
  callbackFn: (pageNumber: number | undefined) => void,
  viewerElement: HTMLDivElement | undefined = undefined
) {
  let elementWithWidth = element.parentElement;
  while (elementWithWidth?.offsetWidth === 0) {
    elementWithWidth = elementWithWidth.parentElement as HTMLDivElement;
    if (elementWithWidth == null) {
      elementWithWidth = element;
      console.warn(
        'Could not find a width for the surrounding container',
        elementWithWidth
      );
      break;
    }
  }

  // Find the parent element that is scrollable
  let scrollableParent: Element | null = elementWithWidth;
  while (
    scrollableParent?.parentElement != null &&
    scrollableParent.scrollTop === 0
  ) {
    scrollableParent = scrollableParent.parentElement;
  }

  if (viewerElement == null) {
    viewerElement = document.createElement('div');
    if (element.childNodes.length > 0) {
      element.childNodes[0].remove();
    }
    element.prepend(viewerElement);
  }
  viewerElement.style.width = `${Math.max(
    elementWithWidth?.offsetWidth || 0,
    200
  )}px`;

  const eventBus = new pdfjsViewer.EventBus();

  const pdfLinkService = new pdfjsViewer.PDFLinkService({
    eventBus: eventBus,
  });

  const pdfFindController = new pdfjsViewer.PDFFindController({
    eventBus: eventBus,
    linkService: pdfLinkService,
  });

  var pdfViewer = new pdfjsViewer.PDFSinglePageViewer({
    container: element,
    viewer: viewerElement,
    eventBus,
    linkService: pdfLinkService,
    findController: pdfFindController,
  });

  pdfLinkService.setViewer(pdfViewer);

  eventBus.on('pagesinit', function() {
    // We can use pdfViewer now, e.g. let's change default scale.
    pdfViewer.currentScaleValue = 'page-width';
  });
  pdfViewer.setDocument(pdfDocument);
  pdfLinkService.setDocument(pdfDocument, null);

  let wordCountToUseForSearch = 30;
  let offset = 0;
  const words = searchString.replace('\n', ' ').split(' ');
  // Heuristic, if the start is a number then we ignore it as it will probably be a numbering
  while (
    (words[offset].match(/^\d+$/) || words[offset].length == 1) &&
    offset < words.length - wordCountToUseForSearch
  ) {
    offset += 1;
  }

  let query = words.slice(offset, offset + wordCountToUseForSearch).join(' ');

  if (query.length > 200) {
    query = query.slice(0, 200);
  }
  /*
  From https://github.com/mozilla/pdfjs-dist/blob/5f07d5a4159bb99eee2f6143d1297f03b45bba58/lib/web/pdf_find_controller.js#L209
  const FindState = {
    FOUND: 0,
    NOT_FOUND: 1,
    WRAPPED: 2,
    PENDING: 3
  };
  */

  eventBus.on('updatefindcontrolstate', function(evt: any) {
    if (evt.state === 1) {
      if (wordCountToUseForSearch > 3) {
        wordCountToUseForSearch -= 1;
        query = words.slice(0, wordCountToUseForSearch).join(' ');
        eventBus.dispatch('find', {
          query,
        });
      } else {
        console.warn("Couldn't find text in document");
        callbackFn(undefined);
      }
    } else if (evt.state === 0) {
      const pageIndex: number = evt.source._offset.pageIdx + 1;

      const tryHighlightInterval = setInterval(() => {
        const highlight = element.querySelector('span.highlight');

        if (highlight != null) {
          let previousScrollTop = scrollableParent?.scrollTop;

          highlight?.scrollIntoView({
            block: 'center',
          });
          scrollableParent?.scrollTo({
            top: previousScrollTop,
          });

          clearInterval(tryHighlightInterval);
          callbackFn(pageIndex);
        }
      }, 20);
    }
  });

  // make things responsive
  window.addEventListener('resize', () => {
    if (viewerElement != null) {
      viewerElement.style.width = `${Math.max(
        elementWithWidth?.offsetWidth || 0,
        200
      )}px`;
      pdfViewer.currentScaleValue = 'page-width';
      pdfViewer.update();
    }
  });

  eventBus.dispatch('find', {
    query,
  });
}
