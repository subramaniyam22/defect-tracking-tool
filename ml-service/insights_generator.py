import httpx
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import logging

logger = logging.getLogger(__name__)


class InsightsGenerator:
    def __init__(self, backend_url: str, api_key: str = ""):
        self.backend_url = backend_url
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=30.0)

    async def _fetch_defects(self, params: Dict[str, Any] = None) -> List[Dict]:
        """Fetch defects from backend"""
        try:
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            response = await self.client.get(
                f"{self.backend_url}/defects",
                headers=headers,
                params=params or {},
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching defects: {str(e)}")
            raise

    async def _fetch_audit_events(self, defect_ids: List[str]) -> List[Dict]:
        """Fetch audit events for defects"""
        try:
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            # Fetch audit events for each defect
            all_events = []
            for defect_id in defect_ids:
                try:
                    response = await self.client.get(
                        f"{self.backend_url}/defects/{defect_id}",
                        headers=headers,
                    )
                    response.raise_for_status()
                    defect_data = response.json()
                    if "auditEvents" in defect_data:
                        for event in defect_data["auditEvents"]:
                            event["defectId"] = defect_id
                            all_events.append(event)
                except Exception:
                    continue
            
            return all_events
        except Exception as e:
            logger.error(f"Error fetching audit events: {str(e)}")
            return []

    def _calculate_reopen_rate(self, defects: List[Dict], audit_events: List[Dict]) -> float:
        """Calculate the rate of defects that have been reopened"""
        if not defects:
            return 0.0
        
        reopened_defects = set()
        
        # Check audit events for REOPENED status changes
        for event in audit_events:
            if event.get("type") == "STATUS_CHANGE":
                try:
                    new_value = event.get("newValue")
                    if new_value:
                        import json
                        new_status = json.loads(new_value).get("status")
                        if new_status == "REOPENED":
                            reopened_defects.add(event.get("defectId"))
                except Exception:
                    continue
        
        # Also check current status
        for defect in defects:
            if defect.get("status") == "REOPENED":
                reopened_defects.add(defect.get("id"))
        
        return len(reopened_defects) / len(defects) * 100

    def _calculate_mean_time_to_fix(self, defects: List[Dict], audit_events: List[Dict]) -> float:
        """Calculate mean time to fix (from OPEN to RESOLVED/CLOSED) in hours"""
        fix_times = []
        
        for defect in defects:
            defect_id = defect.get("id")
            created_at = datetime.fromisoformat(defect.get("createdAt").replace("Z", "+00:00"))
            
            # Find when it was resolved/closed
            resolved_at = None
            for event in audit_events:
                if event.get("defectId") == defect_id and event.get("type") == "STATUS_CHANGE":
                    try:
                        new_value = event.get("newValue")
                        if new_value:
                            import json
                            new_status = json.loads(new_value).get("status")
                            if new_status in ["RESOLVED", "CLOSED"]:
                                resolved_at = datetime.fromisoformat(
                                    event.get("createdAt").replace("Z", "+00:00")
                                )
                                break
                    except Exception:
                        continue
            
            # Also check current status
            if not resolved_at and defect.get("status") in ["RESOLVED", "CLOSED"]:
                resolved_at = datetime.fromisoformat(
                    defect.get("updatedAt").replace("Z", "+00:00")
                )
            
            if resolved_at:
                time_diff = (resolved_at - created_at).total_seconds() / 3600  # Convert to hours
                if time_diff > 0:
                    fix_times.append(time_diff)
        
        return np.mean(fix_times) if fix_times else 0.0

    def _calculate_distributions(self, defects: List[Dict]) -> Dict[str, Any]:
        """Calculate distributions for status, priority, and project"""
        if not defects:
            return {
                "status": {},
                "priority": {},
                "project": {},
            }
        
        df = pd.DataFrame(defects)
        
        status_dist = df["status"].value_counts().to_dict() if "status" in df.columns else {}
        priority_dist = df["priority"].value_counts().to_dict() if "priority" in df.columns else {}
        
        project_dist = {}
        if "project" in df.columns:
            project_names = df["project"].apply(lambda x: x.get("name") if isinstance(x, dict) else str(x))
            project_dist = project_names.value_counts().to_dict()
        
        return {
            "status": {str(k): int(v) for k, v in status_dist.items()},
            "priority": {str(k): int(v) for k, v in priority_dist.items()},
            "project": {str(k): int(v) for k, v in project_dist.items()},
        }

    def _cluster_descriptions(self, defects: List[Dict], n_clusters: int = 5) -> Dict[str, Any]:
        """Cluster defect descriptions using TF-IDF and K-Means"""
        if not defects or len(defects) < n_clusters:
            return {
                "clusters": [],
                "silhouette_score": 0.0,
                "n_clusters": 0,
            }
        
        # Extract descriptions
        descriptions = [
            f"{defect.get('title', '')} {defect.get('description', '')}"
            for defect in defects
        ]
        
        if not descriptions or all(not d.strip() for d in descriptions):
            return {
                "clusters": [],
                "silhouette_score": 0.0,
                "n_clusters": 0,
            }
        
        # TF-IDF vectorization
        vectorizer = TfidfVectorizer(
            max_features=100,
            stop_words="english",
            ngram_range=(1, 2),
            min_df=2,
        )
        
        try:
            tfidf_matrix = vectorizer.fit_transform(descriptions)
        except ValueError:
            # Not enough unique terms, reduce features
            vectorizer = TfidfVectorizer(max_features=50, stop_words="english", min_df=1)
            tfidf_matrix = vectorizer.fit_transform(descriptions)
        
        # Determine optimal number of clusters
        actual_n_clusters = min(n_clusters, len(defects), tfidf_matrix.shape[0])
        if actual_n_clusters < 2:
            return {
                "clusters": [],
                "silhouette_score": 0.0,
                "n_clusters": 0,
            }
        
        # K-Means clustering
        kmeans = KMeans(n_clusters=actual_n_clusters, random_state=42, n_init=10)
        cluster_labels = kmeans.fit_predict(tfidf_matrix)
        
        # Calculate silhouette score
        silhouette = silhouette_score(tfidf_matrix, cluster_labels) if len(set(cluster_labels)) > 1 else 0.0
        
        # Get feature names
        feature_names = vectorizer.get_feature_names_out()
        
        # Build cluster information
        clusters = []
        for i in range(actual_n_clusters):
            cluster_mask = cluster_labels == i
            cluster_defects = [defects[j] for j in range(len(defects)) if cluster_mask[j]]
            
            # Get top terms for this cluster
            cluster_center = kmeans.cluster_centers_[i]
            top_indices = cluster_center.argsort()[-10:][::-1]
            top_terms = [feature_names[idx] for idx in top_indices]
            
            clusters.append({
                "cluster_id": int(i),
                "size": int(cluster_mask.sum()),
                "top_terms": top_terms,
                "defect_ids": [d.get("id") for d in cluster_defects],
            })
        
        return {
            "clusters": clusters,
            "silhouette_score": float(silhouette),
            "n_clusters": int(actual_n_clusters),
        }

    async def generate(
        self,
        scope: str = "global",
        userId: Optional[str] = None,
        teamId: Optional[str] = None,
        startDate: Optional[str] = None,
        endDate: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate insights for the specified scope"""
        # Build query parameters
        params = {}
        if userId:
            params["assignedToId"] = userId
        if startDate:
            params["startDate"] = startDate
        if endDate:
            params["endDate"] = endDate
        
        # Fetch defects
        defects = await self._fetch_defects(params)
        
        if not defects:
            return {
                "scope": scope,
                "userId": userId,
                "teamId": teamId,
                "reopen_rate": 0.0,
                "mean_time_to_fix": 0.0,
                "distributions": {
                    "status": {},
                    "priority": {},
                    "project": {},
                },
                "clustering": {
                    "clusters": [],
                    "silhouette_score": 0.0,
                    "n_clusters": 0,
                },
                "generated_at": datetime.utcnow().isoformat(),
            }
        
        # Fetch audit events
        defect_ids = [d.get("id") for d in defects]
        audit_events = await self._fetch_audit_events(defect_ids)
        
        # Calculate metrics
        reopen_rate = self._calculate_reopen_rate(defects, audit_events)
        mean_time_to_fix = self._calculate_mean_time_to_fix(defects, audit_events)
        distributions = self._calculate_distributions(defects)
        clustering = self._cluster_descriptions(defects)
        
        return {
            "scope": scope,
            "userId": userId,
            "teamId": teamId,
            "reopen_rate": float(reopen_rate),
            "mean_time_to_fix": float(mean_time_to_fix),
            "distributions": distributions,
            "clustering": clustering,
            "generated_at": datetime.utcnow().isoformat(),
        }

    async def store_insights(
        self,
        insights: Dict[str, Any],
        scope: str,
        userId: Optional[str],
        teamId: Optional[str],
    ):
        """Store insights via backend API"""
        try:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            response = await self.client.post(
                f"{self.backend_url}/ml/insights",
                headers=headers,
                json=insights,
            )
            response.raise_for_status()
            logger.info(f"Stored insights for scope: {scope}")
        except Exception as e:
            logger.error(f"Error storing insights: {str(e)}")
            # Don't raise - insights generation should still succeed even if storage fails

